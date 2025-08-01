FROM node:18

WORKDIR /usr/src/awardwiz
COPY . .

RUN apt-get update && apt-get install -y just
RUN npm install
RUN npm run build

EXPOSE 2222
CMD ["node", "dist/server.js"]

RUN apt-get update && apt-get install -y just
