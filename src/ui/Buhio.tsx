/** 仮キャラクター画像。正式な「ぶひお」素材の提供後に差し替える。 */
export function Buhio({ size = 56 }: { size?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}buhio-placeholder.svg`}
      width={size}
      height={size}
      alt=""
      className="buhio"
    />
  );
}
