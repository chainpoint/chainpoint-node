# Node.js 8.x LTS on Debian Stretch Linux
# see: https://github.com/nodejs/LTS
# see: https://hub.docker.com/_/node/
FROM node:12.14.1-stretch

LABEL MAINTAINER="Jacob Henderson <jacob@tierion.com>"

# The `node` user and its home dir is provided by
# the base image. Create a subdir where app code lives.
RUN mkdir /home/node/app

WORKDIR /home/node/app

COPY package.json yarn.lock server.js /home/node/app/
RUN yarn policies set-version 1.22.10
RUN yarn

RUN mkdir -p /home/node/app/scripts
COPY ./scripts/*.sh /home/node/app/scripts/

RUN mkdir -p /home/node/app/lib
COPY ./lib/*.js /home/node/app/lib/

RUN mkdir -p /home/node/app/lib/endpoints
COPY ./lib/endpoints/*.js /home/node/app/lib/endpoints/

RUN mkdir -p /home/node/app/lib/models
COPY ./lib/models/*.js /home/node/app/lib/models/

RUN mkdir -p /root/.lnd
RUN mkdir -p /root/.chainpoint/gateway/data/rocksdb
RUN chmod -R 777 /root

EXPOSE 80

CMD ["yarn", "start"]
