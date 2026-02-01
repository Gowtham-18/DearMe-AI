export type DbResult<T> = {
  data: T | null;
  error: string | null;
};

export type DbListResult<T> = {
  data: T[];
  error: string | null;
};
