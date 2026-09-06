function dc_8x3b1qvDDia(value_parts) {
  let value = value_parts.join('');
  let result = value;
  result = result.replace(/[a-zA-Z]/g, function(c) {
    var o = c.charCodeAt(0), base = (o <= 90) ? 65 : 97;
    return String.fromCharCode((o - base + 25) % 26 + base);
  });
  result = Buffer.from(result, 'base64').toString('utf-8');
  result = result.replace(/[a-zA-Z]/g, function(c) {
    var o = c.charCodeAt(0), base = (o <= 90) ? 65 : 97;
    return String.fromCharCode((o - base + 10) % 26 + base);
  });
  result = result.split('').reverse().join('');
  result = Buffer.from(result, 'base64').toString('utf-8');
  var acc = 74;
  let unmix = '';
  for (let i = 0; i < result.length; i++) {
    var b = result.charCodeAt(i);
    acc = (acc + 16) % 256;
    var plain = b ^ acc;
    acc = (acc + b) % 256;
    unmix += String.fromCharCode(plain);
  }
  return unmix;
}
var arr=["QX1HOHe","mOzuten","ySVVKxb","aSDL29l","VIJxdIm","XNFSMV2","mvcIGGd","Yd1RWAO","AHirfkd","5AHhwPI","qxM1B4R","YWCcomT","cYKAb2q","pTntsNF","AlfkCVc","oB2XIAW","ZXy1O2N","aSaWHfo","Z4XnG1O","HmPSkeL","T0V3VVd","sOXqPSF","1qSXywN","1V3O0iq","L2FwdHt","wdGAoV3","l3R1iAe","lZ5UlN0","eT9CeUA","qVUWQAn","uHPYe6b","0N="];
console.log(dc_8x3b1qvDDia(arr));
