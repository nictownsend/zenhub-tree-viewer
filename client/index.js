import axios from "axios";
import cytoscape from "cytoscape";
import elk from "cytoscape-elk";

cytoscape.use(elk);
const cy = cytoscape({
  container: document.getElementById("root"),
  style:
    "node {background-color : green; label: data(title); text-wrap: wrap; text-max-width:100px;} .closed {background-color: gray;} .epic {background-color: blue;} .edge--epic {line-color: blue;} .edge--dependency {line-style: dashed;}",
});

axios.get("/graph").then((res) => {
  const { nodes, edges } = res.data;
  nodes.forEach((node) => cy.add({ data: node, group: "nodes" }));

  edges.forEach((edge) => cy.add({ data: edge, group: "edges" }));

  const layout = cy.layout({
    elk: {
      algorithm: "mrtree",
      "elk.direction": "DOWN",
    },
    nodeDimensionsIncludeLabels: true,
    fit: false,
    name: "elk",
  });

  cy.nodes("[?closed]").addClass("closed");
  cy.nodes("[?isEpic]").addClass("epic");
  cy.edges("[type='epic']").addClass("edge--epic");
  cy.edges("[type='dependency']").addClass("edge--dependency");

  // cy.startBatch();
  // cy.filter((ele) => ele.outdegree() == 0 && ele.indegree() === 0).remove();
  // cy.endBatch();

  layout.run();
});
