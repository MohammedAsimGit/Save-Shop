/**
 * Opaque transaction handle shared by the store contracts.
 *
 * Only the MongoDB merge coordinator passes one (a Mongoose `ClientSession`); the
 * in-memory stores ignore it. Keeping the stores' public types free of driver
 * imports is what lets ranking, review and merge logic be tested without MongoDB.
 */
export type StoreSession = unknown;
