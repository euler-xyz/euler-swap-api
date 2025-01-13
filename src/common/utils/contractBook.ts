import * as chains from "viem/chains"

const contractBook: any = {
  swapper: {
    abi: require("./abi/Swapper.json"),
    address: {
      [chains.mainnet.id]: "0x2Bba09866b6F1025258542478C39720A09B728bF",
      [chains.base.id]: "0x0D3d0F97eD816Ca3350D627AD8e57B6AD41774df",
      [chains.polygon.id]: "0x3e43F3CE1C364722df6470381Fa1F15ffbFB37E3",
    },
  },
  swapVerifier: {
    abi: require("./abi/SwapVerifier.json"),
    address: {
      [chains.mainnet.id]: "0xae26485ACDDeFd486Fe9ad7C2b34169d360737c7",
      [chains.base.id]: "0x30660764A7a05B84608812C8AFC0Cb4845439EEe",
      [chains.polygon.id]: "0x50C5ca05E916459F32c517932f1b4D78fb11018F",
    },
  },
}

export default contractBook
