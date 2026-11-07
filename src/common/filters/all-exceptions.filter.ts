import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { STATUS_CODES } from 'node:http';

/**
 * The shape of every error response from the API:
 *
 *   { statusCode: 404, error: "Not Found", message: "...", path: "/api/v1/...", timestamp: "..." }
 *
 * Clients (web and mobile) can rely on these fields always being present.
 */
export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  [extra: string]: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Unexpected errors are logged in full on the server but never shown to the client,
    // because their messages can leak internal details (SQL, file paths, etc.).
    if (!(exception instanceof HttpException)) {
      this.logger.error(exception);
    }

    const details = this.extractDetails(exception);
    const body: ErrorResponseBody = {
      ...details,
      statusCode,
      error: (details.error as string) ?? STATUS_CODES[statusCode] ?? 'Error',
      message:
        (details.message as string | string[]) ??
        STATUS_CODES[statusCode] ??
        'Error',
      path: String(httpAdapter.getRequestUrl(ctx.getRequest())),
      timestamp: new Date().toISOString(),
    };

    httpAdapter.reply(ctx.getResponse(), body, statusCode);
  }

  /** Keeps the useful parts of Nest's built-in error responses (e.g. validation messages). */
  private extractDetails(exception: unknown): Record<string, unknown> {
    if (!(exception instanceof HttpException)) {
      return { message: 'Internal server error' };
    }
    const response = exception.getResponse();
    return typeof response === 'string'
      ? { message: response }
      : (response as Record<string, unknown>);
  }
}
