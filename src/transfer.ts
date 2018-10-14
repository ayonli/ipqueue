export function send(event: string, data?: any) {
    return Buffer.from(JSON.stringify([event, data]) + "\r\n\r\n");
}

export function receive(buf: Buffer): Array<[string, any]> {
    let pack = buf.toString().split("\r\n\r\n"),
        parts = [];

    for (let part of pack) {
        if (part) parts.push(JSON.parse(part));
    }

    return parts;
}