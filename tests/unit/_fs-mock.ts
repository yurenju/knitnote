export class FakeDir {
  files = new Map<string, Blob>();
  dirs = new Map<string, FakeDir>();
  name: string;
  constructor(name: string) { this.name = name; }
  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    let d = this.dirs.get(name);
    if (!d) { if (!opts?.create) throw new Error('NotFound'); d = new FakeDir(name); this.dirs.set(name, d); }
    return d as any;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!opts?.create) throw new Error('NotFound');
      this.files.set(name, new Blob());
    }
    const self = this;
    return {
      name,
      async createWritable() {
        return {
          async write(data: Blob | string) {
            const blob = typeof data === 'string' ? new Blob([data]) : data;
            self.files.set(name, blob);
          },
          async close() {}
        };
      },
      async getFile() { return self.files.get(name); }
    } as any;
  }
  async removeEntry(name: string) {
    if (!this.files.delete(name)) this.dirs.delete(name);
  }
  async *entries(): AsyncIterableIterator<[string, any]> {
    for (const [k] of this.files.entries()) yield [k, { kind: 'file', name: k }];
    for (const [k] of this.dirs.entries()) yield [k, { kind: 'directory', name: k }];
  }
}
