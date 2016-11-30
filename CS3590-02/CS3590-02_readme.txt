CS3509-02 Software project submission

Go-Back-N ARQ

Go-Back-N ARQ (automatic repeat request) is a commonly used protocol used to transmit frames based on a specific window size before requiring acknowledgement of receipt from the receiver. It uses sliding window protocol. Both the sender and receiver keep track of the frames. The receiver will make note of what frame it is expecting and will provide acknowledgement of frames received when no error has occurred. The receiver will send a negative acknowledgement when it has received a duplicate or a frame that it was not expecting. When the sender receives a negative acknowledgement, the receiver will resend that frame plus and subsequent frames within the window size to account for the error.

Go-Back-N is able to handle three cases: damaged frame, damaged RR (receive ready), and damaged REJ (negative acknowledgement).

