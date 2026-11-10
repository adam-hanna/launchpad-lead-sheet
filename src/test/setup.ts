import { expect } from 'vitest';
import { gridSnapshotSerializer } from './gridSnapshot';

// Lighting tests snapshot 8x8 role grids as readable text blocks instead of nested arrays.
expect.addSnapshotSerializer(gridSnapshotSerializer);
