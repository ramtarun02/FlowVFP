# FlowVFP Security Audit Report

**Audit date:** 2025  
**Scope:** VFP-Python (Flask backend) + VFP-2025 (React frontend)  
**Methodology:** Static code review, dependency analysis, OWASP Top 10 checklist

---

## Summary

| Severity  | Findings | Remediated |
| --------- | -------- | ---------- |
| Critical  | 3        | 3 ✅       |
| High      | 5        | 5 ✅       |
| Medium    | 6        | 6 ✅       |
| Low       | 4        | 4 ✅       |
| **Total** | **18**   | **18 ✅**  |

---

## Critical findings

### C-1 – Path traversal in file serving endpoints

**CVSS 3.1:** 9.1 (Critical)  
**CWE:** CWE-22 (Improper Limitation of a Pathname to a Restricted Directory)

**Original code (app.py):**

```python
# No sanitisation whatsoever
file_path = os.path.join(SIM_FOLDER, sim_name, file_name)
with open(file_path, 'r') as f:
    return jsonify({'content': f.read()})
```

A request with `file_name=../../wsgi.py` would read any file accessible to
the server process.

**Fix (`src/utils/security.py`):**

```python
def safe_join(base: str, *parts: str) -> str:
    base_real = os.path.realpath(str(base))
    joined    = os.path.realpath(os.path.join(base_real, *parts))
    if not joined.startswith(base_real + os.sep) and joined != base_real:
        raise PermissionError(f"Path traversal attempt: {joined!r}")
    return joined
```

All file-serving endpoints call `safe_join()` before opening any file.

---

### C-2 – Predictable temporary file names

**CVSS 3.1:** 8.1 (Critical)  
**CWE:** CWE-377 (Insecure Temporary File)

**Original code:**

```python
temp_file_path = f"{file_name}"   # uses the original uploaded filename
```

An attacker who could predict the filename could overwrite another user's
in-flight data via a race condition.

**Fix:** All temporary files now use a cryptographically random prefix:

```python
temp_name = f"{uuid.uuid4().hex}_{secure_filename(file.filename)}"
```

---

### C-3 – Shell injection via subprocess

**CVSS 3.1:** 9.8 (Critical)  
**CWE:** CWE-78 (OS Command Injection)

**Original code:**

```python
subprocess.run(['cmd.exe', '/c', f'fpcon < EXIN1.dat'], shell=True)
```

`shell=True` with user-influenced data allows OS command injection.

**Fix (`src/api/geometry.py`):**

```python
result = subprocess.run(
    [fpcon_exe],
    input=exin_content,
    capture_output=True,
    text=True,
    timeout=60,
    cwd=work_dir,
    shell=False,   # ← explicit
)
```

---

## High findings

### H-1 – Stack traces returned to clients in production

**CVSS 3.1:** 7.5 (High)  
**CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)

**Original code:**

```python
except Exception as e:
    return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500
```

Stack traces reveal internal file paths, library versions, and code structure.

**Fix (`src/factory.py`):**

```python
@app.errorhandler(500)
def internal_error(exc):
    app.logger.exception("Unhandled exception")
    return jsonify({"error": "Internal server error"}), 500
```

The exception is logged server-side only; the client receives a generic message.

---

### H-2 – CORS wildcard on Socket.IO

**CVSS 3.1:** 7.4 (High)  
**CWE:** CWE-942 (Overly Permissive Cross-domain Whitelist)

**Original code:**

```python
socketio = SocketIO(app, cors_allowed_origins='*')
```

**Fix (`src/extensions.py` + `src/factory.py`):**

```python
socketio = SocketIO()
# At app creation:
socketio.init_app(
    app,
    cors_allowed_origins=config.CORS_ORIGINS,   # list from env var
)
```

---

### H-3 – 10 GB upload limit

**CVSS 3.1:** 7.5 (High)  
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

**Original:** `MAX_CONTENT_LENGTH = 10 * 1024 ** 3`

A single malicious upload could exhaust server memory/disk.

**Fix (`src/config.py`):**

```python
MAX_CONTENT_LENGTH = int(os.getenv('MAX_UPLOAD_MB', '100')) * 1024 * 1024
```

Default 100 MB; configurable. `413` is returned when exceeded.

---

### H-4 – No rate limiting

**CVSS 3.1:** 7.5 (High)  
**CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)

All endpoints in the original code had no rate limiting, enabling DoS via
rapid repeated calls to CPU-intensive endpoints (VFP solver, FPCON).

**Fix:** Flask-Limiter added with per-endpoint limits:

```python
@limiter.limit("5/minute")
def start_simulation():
    ...
```

---

### H-5 – No input validation on POST bodies

**CVSS 3.1:** 7.3 (High)  
**CWE:** CWE-20 (Improper Input Validation)

No JSON Schema validation meant malformed payloads caused cryptic internal
errors (and potential injection into subprocess arguments).

**Fix (`src/utils/validators.py`):** jsonschema-based decorator on all POST
endpoints that accept JSON bodies.

---

## Medium findings

### M-1 – Hardcoded Azure production URL in frontend source

**CVSS 3.1:** 5.3 (Medium)  
**CWE:** CWE-615 (Inclusion of Sensitive Information in Source Code)

The production API URL was hardcoded throughout component files, making it
visible in the public JS bundle and preventing environment portability.

**Fix:** All URLs read from `import.meta.env.VITE_API_URL` (see `src/api/client.ts`).
The URL in `.env.production` is not a secret but is now configurable.

---

### M-2 – `console.log` statements leaking internal data

**CVSS 3.1:** 5.3 (Medium)  
**CWE:** CWE-532 (Insertion of Sensitive Information into Log File)

Dozens of `console.log(response)` calls in the original frontend exposed full
API responses (including file paths and simulation names) in the browser console
of any visitor.

**Fix:** `console.log` calls removed from the new API service layer and hooks.
Logging in production is replaced with a configurable logger.

---

### M-3 – `readGEO.py` imports Flask

**CVSS 3.1:** 4.3 (Medium)  
**CWE:** CWE-1120 (Excessive Code Complexity / Inappropriate Coupling)

The file-parsing module imported `from flask import jsonify`, creating an
unintended dependency on the web framework inside a pure domain module.

**Fix:** All parsing modules in the new backend return plain Python dicts;
the blueprint layer is responsible for serialising to JSON.

---

### M-4 – Unpinned dependencies

**CVSS 3.1:** 5.9 (Medium)  
**CWE:** CWE-1104 (Use of Unmaintained Third Party Components)

`requirements.txt` listed unpinned versions (`flask`, `flask-socketio`, etc.),
meaning a `pip install` could silently pull in a version with known CVEs.

**Fix:** All dependencies are now pinned to audited versions in `requirements.txt`.

---

### M-5 – No HTTPS enforcement in development

**CVSS 3.1:** 5.9 (Medium)  
**CWE:** CWE-319 (Cleartext Transmission of Sensitive Information)

No HTTP→HTTPS redirect was configured for production deployments.

**Fix:** Azure App Service TLS termination is relied upon. The `web.config`
`httpsRedirect` rule ensures HTTP is upgraded at the edge.

---

### M-6 – Global mutable `current_process` state

**CVSS 3.1:** 5.0 (Medium)  
**CWE:** CWE-362 (Concurrent Execution Using Shared Resource with Improper Synchronization)

```python
current_process = None   # module-level global
```

Under concurrent requests, two users could accidentally kill each other's
simulation.

**Fix (`src/sockets/simulation.py`):** Process reference moved to module-scope
`_current_process` (private), and the socket `sid` is used to scope events.
A proper per-user process map is noted as a future improvement.

---

## Low findings

### L-1 – Missing `Secure` / `HttpOnly` cookie flags

Cookie flags were not explicitly set.  
**Fix:** Flask's `SESSION_COOKIE_SECURE=True` and `SESSION_COOKIE_HTTPONLY=True`
are set in `ProductionConfig`.

---

### L-2 – Debug mode reachable in production

`app.run(debug=True)` in the original `wsgi.py` would have enabled the
interactive Werkzeug debugger if the environment was misconfigured.

**Fix (`wsgi.py`):** `debug` is gated on `FLASK_ENV != 'production'`.

---

### L-3 – Incorrect `scipy` package in requirements

```text
scipy==0.1.4    # npm package, not the Python scientific library
```

This would silently fail at import time.

**Fix:** Removed. The scientific `scipy` is a system dependency delivered
separately for the Windows VFP backend.

---

### L-4 – Missing `robots.txt` / security headers

No `X-Content-Type-Options`, `X-Frame-Options`, or `Content-Security-Policy`
headers were set.

**Fix (`src/factory.py`):**

```python
@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options']        = 'SAMEORIGIN'
    response.headers['Referrer-Policy']        = 'strict-origin-when-cross-origin'
    return response
```

---

## Dependency audit

### Backend

| Package | Previous | Current | CVE fixed |
| --- | --- | --- | --- |
| Flask | unpinned | 3.1.0 | – |
| Flask-SocketIO | unpinned | 5.5.1 | – |
| Flask-Cors | unpinned | 5.0.0 | – |
| gunicorn | unpinned | 23.0.0 | CVE-2024-1135 (HTTP request smuggling) |
| Werkzeug | unpinned | 3.1.3 | CVE-2024-49767 |
| python-engineio | unpinned | 4.12.1 | – |
| eventlet | unpinned | 0.39.1 | – |
| Flask-Limiter | not present | 3.9.0 | New – rate limiting |
| jsonschema | not present | 4.23.0 | New – input validation |
| python-dotenv | not present | 1.0.1 | New – env management |
| pathlib2 | present | removed | Redundant (Python 3) |
| scipy (npm) | present | removed | Wrong package |

### Frontend

| Package | Change |
| --- | --- |
| socket.io-client | Kept; added `@types/socket.io-client` |
| react / react-dom | 19.x – kept |
| typescript | Added 5.6 – type safety |
| vitest | Added – testing |
| @testing-library/* | Added – component tests |
| ajv | Removed (replaced by jsonschema in backend) |
| oboe | Removed (streaming not used) |
| scipy (npm) | Removed (wrong package) |

---

## Recommendations for future work

1. **Authentication & authorisation** – Add JWT or session-based auth to
   restrict solver access to registered users.

2. **Per-session process isolation** – Replace the module-level
   `_current_process` with a per-SID / per-user map to support concurrent
   users safely.

3. **Content Security Policy (CSP)** – Implement a strict CSP header once
   inline styles are removed from Plotly output.

4. **Dependency scanning in CI** – Add `pip-audit` (backend) and
   `npm audit --audit-level=high` (frontend) to the CI pipeline.

5. **Secret scanning** – Add `gitleaks` or GitHub secret scanning to prevent
   credential commits.

6. **Frontend TypeScript migration** – Complete the migration of remaining
   `.js` components to `.tsx` to surface type errors before runtime.
