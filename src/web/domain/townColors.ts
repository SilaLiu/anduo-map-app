export const townColors: Record<string, string> = {
  扎仁镇: '#ef5350',
  强玛镇: '#ff9800',
  帕那镇: '#ffd54f',
  措玛乡: '#9ccc65',
  滩堆乡: '#26a69a',
  扎曲乡: '#26c6da',
  帮麦乡: '#42a5f5',
  雁石坪镇: '#5c6bc0',
  岗尼乡: '#ab47bc',
  玛曲乡: '#ec407a',
  色务乡: '#a1887f',
  玛荣乡: '#c0ca33',
  多玛乡: '#7e57c2',
};

export function isAnduoCounty(properties: Record<string, unknown>) {
  return (
    properties.level === 'county' &&
    (String(properties.adcode) === '540624' || properties.name === '安多县')
  );
}
