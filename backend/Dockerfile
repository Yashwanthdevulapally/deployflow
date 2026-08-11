FROM node:22

WORKDIR /app

COPY package*.json ./

RUN npm install --ignore-scripts

COPY . .



RUN npx prisma generate

RUN npm run build

EXPOSE 5001

CMD ["node", "dist/server.js"]