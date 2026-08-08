FROM python:3.13-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app files
COPY main.py concert.py db.py models.py ./
COPY static/ static/

# Data directory (read-only mount for migration source only)
RUN mkdir -p data

# Create non-root user and set ownership
RUN useradd -m appuser && chown -R appuser:appuser /app

EXPOSE 5000

USER appuser

ENTRYPOINT ["python", "main.py"]
