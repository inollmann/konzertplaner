FROM python:3.13-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app files
COPY main.py concert.py ./
COPY static/ static/

# Data directory for persistence
RUN mkdir -p data static/posters

# Create non-root user and set ownership
RUN useradd -m appuser && chown -R appuser:appuser /app

# Install gosu for proper privilege dropping (works on both Linux and Windows mounts)
RUN apt-get update && \
    apt-get install -y --no-install-recommends wget && \
    wget -O /usr/local/bin/gosu https://github.com/tianon/gosu/releases/download/1.14/gosu-amd64 && \
    chmod +x /usr/local/bin/gosu && \
    rm -rf /var/lib/apt/lists/*

# Create an entrypoint script that:
# 1. Runs as root to fix permissions on mounted volumes
# 2. Then switches to appuser and runs the main process
RUN printf '#!/bin/bash\n\
set -e\n\
echo "Entrypoint: Checking /app/data permissions..."\n\
ls -la /app/data/ 2>&1 || echo "Entrypoint: /app/data does not exist yet"\n\
echo "Entrypoint: Current user: $(whoami)"\n\
if [ -d /app/data ]; then\n\
    echo "Entrypoint: Fixing permissions on /app/data..."\n\
    chown -R appuser:appuser /app/data 2>&1 || true\n\
    chmod -R u+rw /app/data 2>&1 || true\n\
fi\n\
if [ -d /app/static/posters ]; then\n\
    echo "Entrypoint: Fixing permissions on /app/static/posters..."\n\
    chown -R appuser:appuser /app/static/posters 2>&1 || true\n\
    chmod -R u+rw /app/static/posters 2>&1 || true\n\
fi\n\
echo "Entrypoint: Permissions fixed, switching to appuser and starting main.py..."\n\
exec gosu appuser python main.py' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["/app/entrypoint.sh"]
