FROM node:22

WORKDIR /app

COPY package*.json ./

RUN npm install --ignore-scripts

COPY . .

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

RUN npx prisma generate

RUN npm run build

EXPOSE 5001

CMD ["node", "dist/server.js"]