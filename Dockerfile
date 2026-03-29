FROM python:3.12-slim

# Install git + Docker CLI (for deploy/rollback from inside container)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    docker.io \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy server + static files
COPY server.py .
COPY config.default.json .
COPY index.html .
COPY config.html .
COPY css/ css/
COPY js/ js/
COPY scripts/ scripts/

# Config file lives outside the image (mounted volume)
ENV CONFIG_FILE=/data/config.json
ENV REPO_DIR=/repo

EXPOSE 8080

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
