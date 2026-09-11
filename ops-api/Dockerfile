FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
COPY package.json .
COPY pnpm-lock.yaml .
RUN pnpm install --prod --frozen-lockfile --config.manage-package-manager-versions=false
COPY server.js .
COPY llmClient.js .
COPY legalKb.js .
COPY verifactu.js .
COPY revolut.js .
EXPOSE 3011
CMD ["node", "server.js"]
