FROM --platform=linux/amd64 cimg/node:20.9.0
USER root
WORKDIR /app
COPY . .

RUN rm -rf node_modules .angular && \
    npm cache clean --force
RUN npm install --verbose && \
    npm install -g @angular/cli@17.2.0
RUN npm run build:prod --verbose

#docker build -t test --no-cache --progress=plain -f Dockerfile .
