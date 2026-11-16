// Turns the two snapshot files of this page into the arrays createData() takes.
// ip.json holds the manifest and, per provider, its ranges separated by spaces;
// disposable.txt holds one domain per line.

const words = (text, separator) => text.split(separator).filter((word) => word !== '');

export function parseSnapshot(ip, disposable) {
  const ipRanges = [];
  for (const p of ip.providers) {
    for (const cidr of words(p.cidrs, ' ')) ipRanges.push({ cidr, provider: p.id, providerName: p.name, category: p.category });
  }
  return { disposableDomains: words(disposable, '\n'), ipRanges, info: ip.info };
}
