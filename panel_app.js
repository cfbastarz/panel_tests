importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/wheels/bokeh-3.6.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.6.1/dist/wheels/panel-1.6.1-py3-none-any.whl', 'pyodide-http==0.2.1', 'hvplot', 'intake', 'pandas', 'xarray']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  \nimport asyncio\n\nfrom panel.io.pyodide import init_doc, write_doc\n\ninit_doc()\n\n#!/usr/bin/env python\n# coding: utf-8\n\n# In[1]:\n\n\nimport os\nimport xarray as xr\nimport hvplot.xarray\nimport pandas as pd\nimport panel as pn\nimport intake\n\n\n# In[2]:\n\n\nRegs = ['gl', 'hn', 'tr', 'hs', 'as']\nExps = ['DTC']\nStats = ['RMSE', 'VIES', 'MEAN']\n\ndata = '20230216002023030300'\n\n\n# In[3]:\n\n\n#catalog = intake.open_catalog('https://raw.githubusercontent.com/cfbastarz/panel_tests/main/catalog.yml')\ncatalog = intake.open_catalog('https://raw.githubusercontent.com/cfbastarz/panel_tests/main/catalog-no_proxy.yml')\n\n\n# In[ ]:\n\n\n#ds1 = catalog.scantec_gl_rmse_dtc.to_dask()\n\n\n# In[ ]:\n\n\n#ds1\n\n\n# In[4]:\n\n\n#Vars = list(ds1.variables)\n#Vars.remove('time')\n#Vars.remove('lat')\n#Vars.remove('lon')\n\n#variable_list = Vars\nvariable_list = ['pslc000', 'zgeo850']\nvariable = pn.widgets.Select(name='Variable', value=variable_list[0], options=variable_list)\n\nregion = pn.widgets.Select(name='Region', value=Regs[0], options=Regs)\nexperiment = pn.widgets.Select(name='Experiment', value=Exps[0], options=Exps)\nstatistic = pn.widgets.Select(name='Statistic', value=Stats[0], options=Stats)\n\ntest_list = ['ref_GFS', 'ref_Era5', 'ref_PAnl']\ntest = pn.widgets.Select(name='Reference', value=test_list[0], options=test_list)\n\n@pn.cache\ndef loadData(lfname):\n    return catalog[lfname].to_dask()\n\n@pn.depends(variable, region, experiment, statistic, test)\ndef plotFields(variable, region, experiment, statistic, test):\n    if test == 'ref_GFS': ttest = 'T1'\n    if test == 'ref_Era5': ttest = 'T2'\n    if test == 'ref_PAnl': ttest = 'T3'\n    lfname = 'scantec_' + region.lower() + '_' + statistic.lower() + '_' + experiment.lower()\n    #dfs = catalog[lfname].to_dask()\n    dfs = loadData(lfname)\n    cmin=dfs[variable].min()\n    cmax=dfs[variable].max()\n    #cmap='tab20c_r'\n    if region == 'as': \n        frame_width=500\n    else: \n        frame_width=960\n    ax = dfs[variable].hvplot(groupby='time', clim=(cmin, cmax), widget_type='scrubber', widget_location='bottom', \n                              frame_width=frame_width)#, cmap=cmap)\n    return pn.Column(ax, sizing_mode='stretch_width')\n\n@pn.depends(variable, region, experiment, statistic, test)\ndef myName(variable, region, experiment, statistic, test):\n    if test == 'ref_GFS': ttest = 'T1'\n    if test == 'ref_Era5': ttest = 'T2'\n    if test == 'ref_PAnl': ttest = 'T3'\n    lfname = 'scantec_' + region.lower() + '_' + statistic.lower() + '_' + experiment.lower()\n\n    return lfname\n\ncard_parameters = pn.Card(variable, region, experiment, statistic, test, title='Parameters', collapsed=False)\n\nsettings = pn.Column(card_parameters)\n\npn.template.FastListTemplate(\n    site="My Dashboard", title="panel_tests", sidebar=[settings],\n    main=["My test.", myName, plotFields], \n#).show();\n).servable();\n\n\n# In[ ]:\n\n\n\n\n\n\nawait write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.globals.set('patch', msg.patch)
    self.pyodide.runPythonAsync(`
    from panel.io.pyodide import _convert_json_patch
    state.curdoc.apply_json_patch(_convert_json_patch(patch), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.globals.set('location', msg.location)
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads(location)
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()