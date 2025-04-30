async function fetchAllPages() {
  const response = await fetch("pages/index.json");
  const page_urls = await response.json();
  return page_urls;
}

async function fetchAllPageContents(page_urls) {
  const allContents = [];
  for (const page_url of page_urls) {
    const res = await fetch(`pages/${page_url}`);
    const json = await res.json();
    const x = Math.random() * 1000;
    const y = Math.random() * 1000;
    for (const block of json.content) {
      block.x = x;
      block.y = y;
    }
    allContents.push(...json.content);
  }
  return allContents;
}

function setupSimulation(content) {
  const svg = d3.select("svg").call(d3.zoom().on("zoom", zoomed));
  const width = window.innerWidth;
  const height = window.innerHeight;

  // content.forEach((d, i) => {
  //     d.x = d.x || (width / 2) + (i * 10); // Default to center if x is not set
  //     d.y = d.y || (height / 2) + (i * 10); // Default to center if y is not set
  //   });

  const simulation = d3
    .forceSimulation(content)
    .force("charge", d3.forceManyBody().strength(-1))
    .force("center", d3.forceCenter(width / 2, height / 2).strength(0.5))
    .force("collision", d3.forceCollide().radius(40))
    .force("attract", d3.forceManyBody().strength(0.5)) // Added attract force
    .on("tick", ticked);

  const container = svg.append("g");

  const node = container
    .selectAll(".node")
    .data(content)
    .enter()
    .append("g")
    .attr("class", "node")
    .call(d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended));

  node.each(function (d) {
    if (d.type === "image") {
      d3.select(this).append("image").attr("xlink:href", `images/${d.filename}`).attr("width", 100).attr("height", 100);
    } else {
      d3.select(this)
        .append("foreignObject")
        .attr("width", 200)
        .attr("height", 100)
        .append("xhtml:div")
        .attr("class", d.type)
        .html(d.text);
    }
  });

  function ticked() {
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  }

  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  function zoomed(event) {
    container.attr("transform", event.transform);
  }
}

async function main() {
  const page_urls = await fetchAllPages();
  const content = await fetchAllPageContents(page_urls);
  console.log(content);
  setupSimulation(content);
}

main();
