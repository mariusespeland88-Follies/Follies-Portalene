declare module "nodemailer" {
  export interface SendMailOptions {
    from?: string;
    to: string;
    subject?: string;
    text?: string;
    html?: string;
  }

  export interface TransportAuth {
    user: string;
    pass: string;
  }

  export interface TransportOptions {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: TransportAuth;
  }

  export interface Transporter {
    sendMail(options: SendMailOptions): Promise<unknown>;
  }

  export function createTransport(options?: TransportOptions): Transporter;

  const nodemailer: {
    createTransport: typeof createTransport;
  };

  export default nodemailer;
}
