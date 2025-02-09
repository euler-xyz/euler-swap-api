import * as chains from "viem/chains"

const contractBook: any = {
  swapper: {
    abi: require("./abi/Swapper.json"),
    address: {
      [chains.mainnet.id]: "0x2Bba09866b6F1025258542478C39720A09B728bF",
      [chains.base.id]: "0x0D3d0F97eD816Ca3350D627AD8e57B6AD41774df",
      [chains.polygon.id]: "0x3e43F3CE1C364722df6470381Fa1F15ffbFB37E3",
      [1923]: "0x05Eb1A647265D974a1B0A57206048312604Ac6C3",
      [146]: "0xbAf5B12c92711a3657DD4adA6b3C7801e83Bb56a",
    },
  },
  swapVerifier: {
    abi: require("./abi/SwapVerifier.json"),
    address: {
      [chains.mainnet.id]: "0xae26485ACDDeFd486Fe9ad7C2b34169d360737c7",
      [chains.base.id]: "0x30660764A7a05B84608812C8AFC0Cb4845439EEe",
      [chains.polygon.id]: "0x50C5ca05E916459F32c517932f1b4D78fb11018F",
      [1923]: "0x392C1570b3Bf29B113944b759cAa9a9282DA12Fe",
      [146]: "0x003ef4048b45a5A79D4499aaBd52108B3Bc9209f",
    },
  },
}

export default contractBook
