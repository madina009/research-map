const page_urls = [
    'pages/0e5a7fef-7bc9-4ab2-bc86-1d8f37de0bef.md',
    'pages/6ceaa7df-af2f-44da-9e87-8df9319c2355.md',
    'pages/0085c6c1-014b-4fe7-bbf7-9b1be7f8e8c0.md',
    'pages/445a3f0e-642a-431c-9b7c-ea973504f06a.md',
    'pages/9844fcce-0124-48ab-ad38-374b4c8f05b8.md',
    'pages/a4bed5e5-435c-4de2-82e4-4f5f1d92bbf6.md',
    'pages/ba215ee5-cadd-421b-8026-7c15b19310d0.md',
    'pages/ccb5c70d-569d-4ef1-baa9-5add76cae8b9.md',
    'pages/f90dffde-6359-4f65-b4f4-3941f7662bdc.md'
  ];
  
  async function fetchAllPages() {
    const allContents = [];
    for (const page_url of page_urls) {
      const res = await fetch(page_url);
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
    const svg = d3.select("svg")
      .call(d3.zoom().on("zoom", zoomed));
    const width = window.innerWidth;
    const height = window.innerHeight;

    content.forEach((d, i) => {
        d.x = d.x || (width / 2) + (i * 10); // Default to center if x is not set
        d.y = d.y || (height / 2) + (i * 10); // Default to center if y is not set
      });
    
  
    const simulation = d3.forceSimulation(content)
      .force("charge", d3.forceManyBody().strength(-1))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(40))
      .force("attract", d3.forceManyBody().strength(10)) // Added attract force
      .on("tick", ticked);
  
    const container = svg.append("g");
  
    const node = container.selectAll(".node")
      .data(content)
      .enter().append("g")
      .attr("class", "node")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));
  
    node.each(function(d) {
      if (d.type === "image") {
        d3.select(this).append("image")
          .attr("xlink:href", `images/${d.filename}`)
          .attr("width", 100)
          .attr("height", 100);
      } else {
        d3.select(this).append("foreignObject")
          .attr("width", 200)
          .attr("height", 100)
          .append("xhtml:div")
          .attr("class", d.type)
          .html(d.text);
      }
    });
  
    function ticked() {
      node.attr("transform", d => `translate(${d.x},${d.y})`);
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
    const content = await fetchAllPages();
    console.log(content);
    setupSimulation(content);
  }
  
  main();