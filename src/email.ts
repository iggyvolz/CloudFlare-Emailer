// https://docs.cloudmailin.com/http_post_formats/json_normalized/
export default interface EmailMessage
{
    envelope: EmailEnvelope;
    headers: EmailHeaders;
    plain?: string;
    html: string;
    reply_plain?: string;
    attachments: EmailAttachment[];
}

export interface EmailEnvelope
{
    to: string;
    recipients: string[];
    from: string;
    helo_domain: string;
    remote_ip: string;
    spf: EmailSpf;
}

export interface EmailSpf
{
    domain: string;
    result: "none" | "neutral" | "pass" | "fail" | "softfail" | "temperror" | "permerror"
}

export interface EmailHeaders
{
    [key: string]: string|string[];
}

export interface EmailAttachment
{
    file_name: string;
    content_type: string;
    size: number;
    disposition: "attachment" | "inline";
    content_id?: string;
    url?: string;
    content?: string;
}