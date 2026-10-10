FROM python:3.13-slim

# Home Assistant add-on metadata (BUILD_ARCH / BUILD_VERSION are supplied by the
# Supervisor at build time).
ARG BUILD_ARCH
ARG BUILD_VERSION
LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="app" \
    io.hass.arch="${BUILD_ARCH}"

# Ref of the upstream repository to build from. Override with
# `--build-arg KP_REF=<tag-or-branch>` to pin a specific release.
ARG KP_REF=main

ENV LANG=C.UTF-8 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# git: to clone the app source (the add-on build context is only this folder).
# jq: to read the add-on options in run.sh.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git jq \
    && rm -rf /var/lib/apt/lists/*

# The Home Assistant add-on build context is this folder only, so the
# application source is fetched from GitHub at build time. The .git directory
# is removed afterwards (the running commit is therefore unknown to the app,
# which degrades gracefully in /api/repo-update).
WORKDIR /app
RUN git clone --depth 1 --branch "${KP_REF}" \
        https://github.com/inollmann/konzertplaner.git . \
    && rm -rf .git

RUN pip install --no-cache-dir -r requirements.txt

COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
