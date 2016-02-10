cytube-frontend
===============

Frontend layer for future iterations of CyTube.  The end goal is that all HTTP
and socket.io traffic will terminate at the frontend, preventing the backend
from being directly exposed to client traffic.  Currently the only part
implemented is socket.io termination and proxying back to the backend.  More
details on this implementation to be discussed later.
