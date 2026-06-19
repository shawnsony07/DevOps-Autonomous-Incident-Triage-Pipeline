// ❌ BUG: Losing 'this' context in a callback
class Service {
  constructor() { this.name = 'MyService'; }
  logName() { console.log(this.name); }
  run() {
    setTimeout(this.logName, 100);
  }
}
export const service = new Service();