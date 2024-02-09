FROM cffnpwr/git as git

FROM oven/bun as bun

FROM node:lts as node

FROM debian:bookworm

ARG UID=1000
ARG GID=1000
ARG USERNAME=developer

WORKDIR /workspace

COPY --from=git /usr/bin/git /usr/bin
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bunx /usr/local/bin/
COPY --from=node /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/

RUN apt-get update && \
  apt-get install -y --no-install-recommends sudo curl gpg openssh-client ca-certificates && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/* && \
  groupadd --gid $GID $USERNAME && \
  useradd --uid $UID --gid $GID -m -s /bin/bash $USERNAME && \
  echo "${USERNAME}   ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

USER ${USERNAME}
