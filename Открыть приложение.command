#!/bin/bash
# Двойной щелчок: собирает приложение (если нужно) и открывает его в браузере.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ ! -d node_modules ]; then echo "Ставлю зависимости…"; npm install || exit 1; fi
if [ ! -f dist/index.html ]; then echo "Собираю приложение…"; npm run build || exit 1; fi
if ! curl -s -o /dev/null http://localhost:4173; then
  echo "Запускаю превью на http://localhost:4173"
  nohup npx vite preview --port 4173 >/dev/null 2>&1 &
  for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:4173 && break; sleep 0.5; done
fi
open "http://localhost:4173"
echo "Открыто: http://localhost:4173 — это окно можно закрыть."
