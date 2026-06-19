---
created: 2026-05-11
tags:
  - 0🌲
public: true
categories:
  - "[[Softwares]]"
maker: ""
url: https://podman.io
rating: "7"
---
## SECRETS
- To create a secret, use the command `podman secret create`.
- To list the secrets, use the command `podman secret ls`.
## Useful commands
### List all containers
``` shell
podman ps --all
```
### Start a container
``` shell
podman container start ContainerName
```
Example:
```shell
podman container start KDCockpit.Database
```
