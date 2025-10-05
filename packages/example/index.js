export function hello() {
  return "Hello from @onsegil/example";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(hello());
}
