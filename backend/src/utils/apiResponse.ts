export function success(data: unknown, message = "Success") {
  return {
    success: true,
    message,
    data,
  };
}

export function failure(message: string) {
  return {
    success: false,
    message,
  };
}