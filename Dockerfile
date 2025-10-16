# Use Ubuntu 20.04 as base (better Wine compatibility than Debian slim)
FROM ubuntu:20.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV WINEPREFIX=/app/.wine
ENV DISPLAY=:99

# Update package lists and install dependencies
RUN apt-get update && apt-get upgrade -y

# Install Python 3.11 and pip
RUN apt-get install -y \
    software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y \
    python3.11 \
    python3.11-dev \
    python3.11-distutils \
    python3-pip \
    curl \
    wget \
    procps \
    xvfb

# Set Python 3.11 as default
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 \
    && update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1

# Install Wine with proper architecture setup
RUN dpkg --add-architecture i386 \
    && apt-get update \
    && apt-get install -y \
    wine \
    winetricks \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create app directory and set permissions
WORKDIR /app

# Create necessary directories
RUN mkdir -p data/uploads data/Simulations data/temp logs tools .wine \
    && chmod -R 755 data logs tools .wine

# Copy requirements and install Python packages
COPY requirements.txt .
RUN python3 -m pip install --upgrade pip \
    && python3 -m pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Initialize Wine (simplified approach to avoid hanging)
RUN export DISPLAY=:99 \
    && Xvfb :99 -screen 0 1024x768x16 & \
    && sleep 10 \
    && wine --version || true \
    && wineboot --init || true \
    && sleep 5

# Create startup script
RUN echo '#!/bin/bash\n\
    export DISPLAY=:99\n\
    export WINEPREFIX=/app/.wine\n\
    echo "Starting Xvfb..."\n\
    Xvfb :99 -screen 0 1024x768x16 &\n\
    sleep 10\n\
    echo "Testing Wine..."\n\
    wine --version || echo "Wine test failed, continuing..."\n\
    echo "Starting Flask application..."\n\
    exec gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT --timeout 120 --keep-alive 2 src.app:app\n\
    ' > /app/start.sh \
    && chmod +x /app/start.sh

# Expose port
EXPOSE 5000

# Use the startup script
CMD ["/app/start.sh"]
