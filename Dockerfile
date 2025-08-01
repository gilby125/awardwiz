FROM node:18

# Install system dependencies like 'just' first
RUN apt-get update && apt-get install -y just

WORKDIR /usr/src/awardwiz

# Copy the rest of your application files
COPY . .

# Install npm dependencies and build the project
RUN npm install
RUN npm run build

EXPOSE 2222
CMD ["node", "dist/server.js"]
