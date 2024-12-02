import * as chains from "viem/chains"

const contractBook: any = {
  swapper: {
    abi: require("./abi/Swapper.json"),
    address: {
      [chains.mainnet.id]: "0x2Bba09866b6F1025258542478C39720A09B728bF",
      [chains.base.id]: "0xfb2833cB343602BaE5EB41bbF3345f75bb4Dd152",
      [chains.polygon.id]: "0x3e43F3CE1C364722df6470381Fa1F15ffbFB37E3",
    },
  },
  swapVerifier: {
    abi: require("./abi/SwapVerifier.json"),
    address: {
      [chains.mainnet.id]: "0xae26485ACDDeFd486Fe9ad7C2b34169d360737c7",
      [chains.base.id]: "0x344Eb43866838207c2dd6e03553CC370a98042C7",
      [chains.polygon.id]: "0x50C5ca05E916459F32c517932f1b4D78fb11018F",
    },
  },
}

export default contractBook
