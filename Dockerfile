# Use Python 3.11 slim as base image (good balance of features and size)
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV WINEPREFIX=/app/.wine
ENV DISPLAY=:99

# Install system dependencies including Wine
RUN apt-get update && apt-get install -y \
    wine \
    wine32 \
    wine64 \
    xvfb \
    curl \
    wget \
    procps \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create app directory and set as working directory
WORKDIR /app

# Create necessary directories with proper permissions
RUN mkdir -p data/uploads data/Simulations data/temp logs tools .wine \
    && chmod -R 755 data logs tools .wine

# Copy requirements first for better Docker layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Initialize Wine in background (this may take time on first run)
RUN Xvfb :99 -screen 0 1024x768x16 & \
    sleep 10 && \
    wine --version && \
    (timeout 60 wineboot --init || true) && \
    sleep 5

# Create a health check script
RUN echo '#!/bin/bash\ncurl -f http://localhost:$PORT/health || exit 1' > /app/healthcheck.sh \
    && chmod +x /app/healthcheck.sh

# Expose the port that Render will use
EXPOSE 5000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /app/healthcheck.sh

# Start command - start Xvfb, wait, then start the Flask app
CMD ["sh", "-c", "Xvfb :99 -screen 0 1024x768x16 & sleep 10 && wine --version && gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT --timeout 120 --keep-alive 2 src.app:app"]