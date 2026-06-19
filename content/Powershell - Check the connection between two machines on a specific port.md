---
created: 2026-06-04
tags:
  - 0🌲
  - tech
public: true
---
```shell
Test-NetConnection -ComputerName uaessi-swt1.intra.chu-nantes.fr -Port 52550
```

Example: 
```shell
Test-NetConnection -ComputerName uaessi-swt1.intra.chu-nantes.fr -Port 52550          WARNING: TCP connect to (10.167.212.21 : 52550) failed                                                                                                                                                                                          
ComputerName           : uaessi-swt1.intra.chu-nantes.fr
RemoteAddress          : 10.167.212.21
RemotePort             : 52550
InterfaceAlias         : Ethernet0
SourceAddress          : 10.167.212.116
PingSucceeded          : True
PingReplyDetails (RTT) : 0 ms
TcpTestSucceeded       : False
```