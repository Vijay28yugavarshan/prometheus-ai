#!/bin/sh
# Hardened example docker run for sandbox (DO NOT enable without audit)
# - no network (--network none)
# - read-only filesystem where possible
# - memory limit (-m)
# - CPU quota via --cpus
# - seccomp profile may be added for extra safety
# This is a template. Customize the image to a minimal runtime for the language you support.

IMAGE=python:3.11-alpine
WORKDIR=/tmp/sandbox

docker run --rm \
  --network none \
  -m 128m \
  --cpus 0.5 \
  --pids-limit=64 \
  --read-only \
  -v ${WORKDIR}:/sandbox:ro \
  --tmpfs /tmp:rw,size=16m \
  --security-opt no-new-privileges:true \
  $IMAGE sh -c "timeout 5s python /sandbox/script.py"
echo "Sandbox run completed (template)"
