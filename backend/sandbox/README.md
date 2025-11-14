Sandbox runner (Docker-based) - design notes


This folder contains a scaffold for a Docker-based isolated code execution sandbox.

Files:
- runner.sh : example docker run command to start isolated container
- runner.js : example Node script that would invoke docker to run user code inside a restricted container

WARNING: Do NOT run untrusted code on the host. Use Docker with strict resource limits and seccomp profiles.
