/**
 * Standard Response structure of Rubix Core
 *
 * @property status - The status of the response.
 * @property message - A message providing additional information about the response.
 * @property result - The result data of the response, which can be a string, an object, or null.
 */
export interface RubixResponse<T = string | Record<string, any> | null> {
  status: boolean;
  message: string;
  result: T;
}
