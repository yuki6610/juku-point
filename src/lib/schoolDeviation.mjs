// Peter J. Acklam's inverse-normal approximation. The percentile is the
// percentage of students ranked above the learner (for example, top 10%).
function inverseNormal(probability){
  const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.357751867269,-30.66479806614716,2.506628277459239],b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572],c=[-.007784894002430293,-.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783],d=[.007784695709041462,.3224671290700398,2.445134137142996,3.754408661907416],low=.02425,high=1-low;
  if(probability<low){const q=Math.sqrt(-2*Math.log(probability));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}
  if(probability>high){const q=Math.sqrt(-2*Math.log(1-probability));return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}
  const q=probability-.5,r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}

export function schoolDeviationFromTopPercent(value){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const percentile=Number(value);
  if(!Number.isFinite(percentile)||percentile<=0||percentile>=100)return null;
  return Math.round((50+10*inverseNormal(1-percentile/100))*10)/10;
}

export function normalizeTopPercent(value){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const percentile=Math.round(Number(value)*10)/10;
  if(!Number.isFinite(percentile)||percentile<=0||percentile>=100)throw new Error('学年上位％は0より大きく100未満で入力してください。');
  return percentile;
}
