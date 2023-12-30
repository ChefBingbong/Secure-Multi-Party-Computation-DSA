import * as net from "net";

export interface P2PNetwork {
      connections: Map<string, net.Socket>;
      neighbors: Map<string, string>;
      NODE_ID: string;

      listen(
            port: number,
            ports: number[],
            cb?: () => void
      ): (cb?: any) => net.Server;
      connect: (
            ip: string,
            port: number,
            cb?: () => void
      ) => (cb: Error) => net.Socket;
      close: (cb: () => void) => void;
      broadcast: (
            message: any,
            id?: string,
            origin?: string,
            ttl?: number
      ) => void;
      sendDirect: (
            destination: any,
            message: any,
            id?: string,
            origin?: string,
            ttl?: number
      ) => void;
}

export interface Message {
      type: string;
      data?: { nodeId: string };
      message?: any;
      id?: string;
      origin?: string;
      destination?: string;
      ttl?: number;
}
