FROM python:3.13-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app files
COPY main.py concert.py db.py models.py ./
COPY static/ static/

# Data directory: holds the SQLite database and legacy migration sources
RUN mkdir -p data

# Container-friendly runtime defaults (no reloader, fixed port). The SQLite
# path defaults to /app/data/konzertplaner.db via db.py; override DATABASE_URL
# to point at PostgreSQL instead.
ENV KP_DEBUG=0 \
    PORT=5000

# Create non-root user and set ownership
RUN useradd -m appuser && chown -R appuser:appuser /app

EXPOSE 5000

USER appuser

ENTRYPOINT ["python", "main.py"]
