export function send(event: number, ...data: any[]) {
    return Buffer.from(JSON.stringify([event, ...data]) + "\r\n\r\n");
}

export function receive(buf: Buffer): Array<[number, number, any]> {
    let pack = buf.toString().split("\r\n\r\n"),
        parts = [];

    for (let part of pack) {
        if (part) parts.push(JSON.parse(part));
    }

    return parts;
}