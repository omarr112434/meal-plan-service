# The Meal Plan API (Node.js + Express).
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# install only what the app needs to run (no test tools)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# don't run as root inside the container
USER node
EXPOSE 3000
CMD ["node", "server.js"]
