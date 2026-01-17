/**
 * Book entity operations
 */

import type { Book, CreateBookInput, MediaType } from './types.js';
import { getBookByIsbn, saveBook, saveBooks, getSeriesById } from './store.js';

/**
 * Create a new book entity
 */
export async function createBook(input: CreateBookInput): Promise<Book> {
  const now = new Date().toISOString();
  
  const book: Book = {
    id: input.id,
    seriesId: input.seriesId,
    volumeNumber: input.volumeNumber,
    title: input.title,
    mediaType: input.mediaType,
    externalIds: input.externalIds ?? {},
    isbn10: input.isbn10,
    releaseDate: input.releaseDate,
    createdAt: now,
    updatedAt: now,
  };
  
  await saveBook(book);
  console.log(`[Book] Created book: ${book.id} - "${book.title}"`);
  
  return book;
}

/**
 * Find or create a book by ISBN
 */
export async function findOrCreateBook(input: CreateBookInput): Promise<Book> {
  const existing = await getBookByIsbn(input.id);
  if (existing) {
    console.log(`[Book] Found existing book: ${existing.id} - "${existing.title}"`);
    return existing;
  }
  
  return createBook(input);
}

/**
 * Create multiple books at once (more efficient)
 */
export async function createBooks(inputs: CreateBookInput[]): Promise<Book[]> {
  const now = new Date().toISOString();
  
  const books: Book[] = inputs.map(input => ({
    id: input.id,
    seriesId: input.seriesId,
    volumeNumber: input.volumeNumber,
    title: input.title,
    mediaType: input.mediaType,
    externalIds: input.externalIds ?? {},
    isbn10: input.isbn10,
    releaseDate: input.releaseDate,
    createdAt: now,
    updatedAt: now,
  }));
  
  await saveBooks(books);
  console.log(`[Book] Created ${books.length} books`);
  
  return books;
}

/**
 * Find or create multiple books (efficient batch operation)
 */
export async function findOrCreateBooks(inputs: CreateBookInput[]): Promise<Book[]> {
  const results: Book[] = [];
  const toCreate: CreateBookInput[] = [];
  
  // Check which books already exist
  for (const input of inputs) {
    const existing = await getBookByIsbn(input.id);
    if (existing) {
      results.push(existing);
    } else {
      toCreate.push(input);
    }
  }
  
  // Create new books
  if (toCreate.length > 0) {
    const created = await createBooks(toCreate);
    results.push(...created);
  }
  
  console.log(`[Book] Found ${results.length - toCreate.length} existing, created ${toCreate.length} new`);
  
  // Sort by volume number to maintain order
  return results.sort((a, b) => a.volumeNumber - b.volumeNumber);
}

/**
 * Update book with NC Cardinal record ID
 */
export async function updateBookWithNCCardinal(
  isbn: string,
  ncCardinalRecordId: string
): Promise<Book | null> {
  const book = await getBookByIsbn(isbn);
  if (!book) {
    return null;
  }
  
  book.externalIds.ncCardinalRecordId = ncCardinalRecordId;
  book.updatedAt = new Date().toISOString();
  
  await saveBook(book);
  return book;
}

/**
 * Get book with its series info
 */
export async function getBookWithSeries(isbn: string): Promise<{
  book: Book;
  series: import('./types.js').Series;
} | null> {
  const book = await getBookByIsbn(isbn);
  if (!book) {
    return null;
  }
  
  const series = await getSeriesById(book.seriesId);
  if (!series) {
    console.warn(`[Book] Book ${isbn} has invalid seriesId: ${book.seriesId}`);
    return null;
  }
  
  return { book, series };
}
