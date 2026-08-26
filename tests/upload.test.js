// Optional supporting documents.
//
// Two promises are being kept here, and both are easy to break by accident:
// the upload is optional and never blocks a registration, and the file is
// readable by platform administrators alone. storage.rules is the enforcement;
// these tests pin the client behaviour and the rules text that backs it.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  documentProblem, safeFileName, MAX_DOCUMENT_BYTES, ACCEPTED_DOCUMENT_TYPES,
} from '../public/js/upload.js';

const file = (over = {}) => ({
  name: 'letterhead.pdf', size: 1024, type: 'application/pdf', ...over,
});

describe('what may be attached', () => {
  test('no file is not a problem, because attaching one is optional', () => {
    assert.equal(documentProblem(null), null);
    assert.equal(documentProblem(undefined), null);
  });

  test('a letter or a photograph of one is accepted', () => {
    for (const type of ACCEPTED_DOCUMENT_TYPES) {
      assert.equal(documentProblem(file({ type })), null, type);
    }
  });

  test('an oversized file is refused before the upload, with the size named', () => {
    const problem = documentProblem(file({ size: MAX_DOCUMENT_BYTES + 1 }));
    assert.match(problem, /10 MB/);
    assert.match(problem, /lower resolution/,
      'tell them what to do about it, not only that it failed');
  });

  test('an unexpected file type is refused', () => {
    assert.match(documentProblem(file({ type: 'application/zip' })), /PDF or a photograph/);
  });
});

describe('file names are user input', () => {
  test('path separators and anything exotic are stripped', () => {
    assert.equal(safeFileName('../../etc/passwd').includes('/'), false);
    assert.match(safeFileName('my letter (final).pdf'), /^[a-zA-Z0-9._-]+$/);
  });

  test('a name that reduces to nothing still yields something usable', () => {
    assert.ok(safeFileName('///').length > 0);
    assert.ok(safeFileName('').length > 0);
  });

  test('a leading dot cannot make a hidden file', () => {
    assert.equal(safeFileName('.htaccess').startsWith('.'), false);
  });
});

describe('storage.rules keeps documents to administrators', () => {
  const rules = readFileSync('storage.rules', 'utf8');

  test('reads are administrator-only', () => {
    assert.match(rules, /allow read: if isPlatformAdmin\(\);/,
      'a document must not be readable by the community, other organizations, '
      + 'or the applicant');
  });

  test('nothing outside the verification path is reachable at all', () => {
    assert.match(rules, /match \/\{allPaths=\*\*\} \{[\s\S]{0,120}allow read, write: if false;/,
      'the bucket must be closed by default');
  });

  test('a stored document cannot be swapped after it is read', () => {
    assert.match(rules, /allow update: if false;/,
      'replacing a document in place would let the version an administrator '
      + 'read be exchanged for another');
  });

  test('the size and type limits match the client', () => {
    assert.match(rules, /10 \* 1024 \* 1024/);
    assert.match(rules, /application\/pdf\|image\//);
  });

  test('only the organization’s owner can upload against it', () => {
    assert.match(rules, /allow create: if isOrgOwner\(orgId\)/);
    // Ownership is read from the same Firestore record the rest of the system
    // uses, rather than a second copy of who is who that could drift.
    assert.match(rules, /firestore\.get\(\/databases\/\(default\)\/documents\/organizations/);
  });
});

describe('the form never requires a document', () => {
  const org = readFileSync('public/js/views/org.js', 'utf8');

  test('the file input is not required, and says so', () => {
    const block = org.slice(org.indexOf("id: 'supportingDocument'"));
    assert.ok(!/required: true/.test(block.slice(0, 200)),
      'attaching a document must never be required');
    assert.match(org, /registration is refused for not having one/,
      'the form must say a missing document is not held against them');
  });

  test('government identification is refused as a category, in writing', () => {
    assert.match(org, /We do not ask for government identification/);
  });

  test('a failed upload does not lose the registration', () => {
    // The organization is created first and is in the queue either way.
    assert.match(org, /Registered, but the document did not upload/);
  });
});
