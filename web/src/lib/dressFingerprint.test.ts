import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fingerprintSimilarity, type DressFingerprint } from "./dressFingerprint";

function fp(partial: Partial<DressFingerprint>): DressFingerprint {
  return {
    style: "Lehenga",
    primaryColor: "Royal Blue",
    secondaryColor: "Gold",
    embroideryStyle: "Heavy Zari",
    embroideryPattern: "Concentric Arch",
    borderDesign: "Scalloped gold zari border",
    fabric: "Silk",
    distinctiveFeatures: "Blue cutdana with arch motif layout variant 2",
    occasion: "Bridal",
    searchText: "",
    ...partial,
  };
}

describe("fingerprintSimilarity", () => {
  it("ranks same-pattern blue dress above different-pattern blue dress", () => {
    const query = fp({
      primaryColor: "Royal Blue",
      embroideryPattern: "Concentric Arch with floral infill",
      distinctiveFeatures: "BLUE CUTDANA 2 arch fan pattern layout",
    });

    const cutdana2 = fp({
      primaryColor: "Royal Blue",
      embroideryPattern: "Concentric Arch with floral infill",
      distinctiveFeatures: "BLUE CUTDANA 2 distinctive arch border arrangement",
    });

    const cutdana3 = fp({
      primaryColor: "Royal Blue",
      embroideryPattern: "Radiating Floral Jaal",
      distinctiveFeatures: "CUTDANA 3 floral jaal all-over pattern different layout",
    });

    const score2 = fingerprintSimilarity(query, cutdana2);
    const score3 = fingerprintSimilarity(query, cutdana3);

    assert.ok(score2 > score3);
    assert.ok(score2 >= 60);
  });

  it("ranks same-colour green dress above blue dress with similar embroidery", () => {
    const query = fp({
      primaryColor: "Pistachio Green",
      embroideryPattern: "Floral Jaal with mirror work",
      distinctiveFeatures: "Light green lehenga with dense floral motifs",
    });

    const pista = fp({
      primaryColor: "Mint Green",
      embroideryPattern: "Floral Jaal with mirror accents",
      distinctiveFeatures: "PISTA SIKKIYA pistachio green floral lehenga",
    });

    const blueCutdana = fp({
      primaryColor: "Royal Blue",
      embroideryPattern: "Floral Jaal with mirror work",
      distinctiveFeatures: "BLUE CUTDANA 3 navy blue floral lehenga",
    });

    const pistaScore = fingerprintSimilarity(query, pista);
    const blueScore = fingerprintSimilarity(query, blueCutdana);

    assert.ok(pistaScore > blueScore);
    assert.ok(blueScore < 35);
  });

  it("ranks honeycomb-panel CUTDANA 2 above jaal CUTDANA 3 for matching query", () => {
    const query = fp({
      primaryColor: "Navy Blue",
      embroideryPattern: "Honeycomb Hex Panel with Vertical Floral Panels",
      borderDesign: "Wide multi-band hem with hex mesh and floral rows",
      distinctiveFeatures: "Alternating vertical panels of honeycomb hex mesh and large floral motifs",
    });

    const cutdana2 = fp({
      primaryColor: "Royal Blue",
      embroideryPattern: "Vertical Floral Panel with Honeycomb Hex Mesh",
      borderDesign: "Wide scalloped hem with hex mesh bands and floral rows",
      distinctiveFeatures: "Vertical panel layout with honeycomb hex mesh alternating floral panels",
    });

    const cutdana3 = fp({
      primaryColor: "Royal Blue",
      embroideryPattern: "All-over Radiating Floral Jaal",
      borderDesign: "Dense floral jaal border with radiating motifs",
      distinctiveFeatures: "All-over radiating floral jaal pattern without vertical hex panels",
    });

    assert.ok(fingerprintSimilarity(query, cutdana2) > fingerprintSimilarity(query, cutdana3));
  });
});
