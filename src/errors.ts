/** An error that maps to a specific HTTP status and a message that is safe to show the client. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class ModelTimeoutError extends HttpError {
  constructor() {
    super(504, "Model timed out");
    this.name = "ModelTimeoutError";
  }
}

export class ModelError extends HttpError {
  constructor(detail: string) {
    super(502, `Model error: ${detail}`);
    this.name = "ModelError";
  }
}
