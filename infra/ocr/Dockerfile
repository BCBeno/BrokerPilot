# Serviciu OCR local (spec 7.8): Tesseract cu limba română + poppler pentru PDF-uri scanate.
# Rulează doar în rețeaua compose (fără port publicat): imaginile documentelor nu pleacă în cloud.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-ron tesseract-ocr-eng poppler-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.mjs ./

ENV PORT=8080 OMP_THREAD_LIMIT=1
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
