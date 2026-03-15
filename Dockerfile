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

EXPOSE 5000

CMD ["python", "main.py"]
